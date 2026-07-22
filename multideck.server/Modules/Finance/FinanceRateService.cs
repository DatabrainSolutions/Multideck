using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Finance;

public sealed class FinanceRateService(
    MultideckContext db,
    IWarehouseContext workspace,
    HttpClient httpClient) : IFinanceRateService
{
    private const string EcbProviderCode = "ECB";
    private const string EcbDailyPath = "stats/eurofxref/eurofxref-daily.xml";
    private const string EcbDailyUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

    public async Task<FinanceCurrenciesResponse> GetCurrenciesAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        await workspace.RequireCurrentUserAsync(user, cancellationToken);

        var currencies = await (from setting in db.FinCurrencySettings.AsNoTracking()
            join currency in db.SysCurrencies.AsNoTracking()
                on setting.FincurSetCurrencyCode equals currency.CurrencyCode
            where setting.FincurSetIsActive && setting.FincurSetIsPermittedForQuote
            orderby setting.FincurSetCurrencyCode
            select new FinanceCurrencyDto(
                setting.FincurSetCurrencyCode,
                currency.CurrencyName ?? setting.FincurSetName,
                currency.CurrencySymbol ?? setting.FincurSetCurrencyCode,
                setting.FincurSetDecimalPlaces,
                setting.FincurSetIsActive,
                currency.CurrencyUnitName,
                currency.CurrencySubUnitName,
                currency.CurrencySubUnitRatio,
                null))
            .ToListAsync(cancellationToken);

        var asOf = await db.FinExchangeRates.AsNoTracking()
            .Where(rate => rate.FinrateIsApproved && rate.FinrateMidRate.HasValue)
            .MaxAsync(rate => (DateOnly?)rate.FinrateRateDate, cancellationToken);

        return new FinanceCurrenciesResponse(currencies, asOf);
    }

    public async Task<FinanceExchangeRatesResponse> GetExchangeRatesAsync(
        ClaimsPrincipal user,
        string baseCurrency,
        CancellationToken cancellationToken)
    {
        await workspace.RequireCurrentUserAsync(user, cancellationToken);

        var normalizedBase = NormalizeCurrencyCode(baseCurrency);
        var permittedCodes = await db.FinCurrencySettings.AsNoTracking()
            .Where(setting => setting.FincurSetIsActive && setting.FincurSetIsPermittedForQuote)
            .OrderBy(setting => setting.FincurSetCurrencyCode)
            .Select(setting => setting.FincurSetCurrencyCode)
            .ToListAsync(cancellationToken);

        if (!permittedCodes.Contains(normalizedBase, StringComparer.OrdinalIgnoreCase))
        {
            throw WarehouseException.BadRequest($"{normalizedBase} is not enabled for quotes in this workspace.");
        }

        var lookupCodes = permittedCodes.Append("EUR").Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var storedRates = await db.FinExchangeRates.AsNoTracking()
            .Include(rate => rate.FinrateProvider)
            .Where(rate =>
                rate.FinrateIsApproved &&
                rate.FinrateMidRate.HasValue && rate.FinrateMidRate > 0 &&
                rate.FinrateProvider.FinrateProviderIsActive &&
                lookupCodes.Contains(rate.FinrateFromCurrencyCode) &&
                lookupCodes.Contains(rate.FinrateToCurrencyCode))
            .OrderByDescending(rate => rate.FinrateRateDate)
            .ThenByDescending(rate => rate.FinrateIsOfficial)
            .ThenByDescending(rate => rate.FinrateImportedAt)
            .ToListAsync(cancellationToken);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = new List<FinanceExchangeRateDto>(permittedCodes.Count);
        foreach (var target in permittedCodes)
        {
            if (string.Equals(normalizedBase, target, StringComparison.OrdinalIgnoreCase))
            {
                result.Add(new FinanceExchangeRateDto(normalizedBase, target, 1m, 1m, 1m,
                    "reference", "current", null, null, 0, "Base currency"));
                continue;
            }

            var resolved = Resolve(storedRates, normalizedBase, target);
            if (resolved is null)
            {
                result.Add(new FinanceExchangeRateDto(normalizedBase, target, null, null, null,
                    "reference", "unavailable", null, null, null, null));
                continue;
            }

            var businessDaysOld = BusinessDaysBetween(resolved.RateDate, today);
            var status = businessDaysOld <= 1 ? "current" : "stale";
            result.Add(new FinanceExchangeRateDto(
                normalizedBase,
                target,
                resolved.Rate,
                resolved.Rate,
                resolved.Rate,
                resolved.Source,
                status,
                resolved.Provider,
                resolved.RateDate,
                businessDaysOld,
                resolved.SourceReference));
        }

        return new FinanceExchangeRatesResponse(
            normalizedBase,
            result,
            result.Where(rate => rate.Rate.HasValue).Max(rate => rate.EffectiveAt));
    }

    public async Task<FinanceExchangeRateRefreshResponse> RefreshEcbRatesAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var currentUser = await workspace.RequireCurrentUserAsync(user, cancellationToken);
        var payload = await httpClient.GetByteArrayAsync(EcbDailyPath, cancellationToken);
        if (payload.Length == 0 || payload.Length > 1_000_000)
        {
            throw WarehouseException.BadRequest("The ECB daily reference feed returned an invalid payload.");
        }

        var feed = ParseEcbFeed(payload);
        var permittedCodes = await db.FinCurrencySettings.AsNoTracking()
            .Where(setting => setting.FincurSetIsActive && setting.FincurSetIsPermittedForQuote)
            .Select(setting => setting.FincurSetCurrencyCode)
            .ToListAsync(cancellationToken);
        var importedRates = feed.Rates
            .Where(rate => permittedCodes.Contains(rate.Key, StringComparer.OrdinalIgnoreCase))
            .ToDictionary(rate => rate.Key, rate => rate.Value, StringComparer.OrdinalIgnoreCase);

        if (importedRates.Count == 0)
        {
            throw WarehouseException.BadRequest("The ECB feed did not contain any currencies enabled for quotes.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var provider = await db.FinExchangeRateProviders
            .SingleOrDefaultAsync(value => value.FinrateProviderCode == EcbProviderCode, cancellationToken);
        if (provider is null)
        {
            provider = new FinExchangeRateProvider
            {
                FinrateProviderId = Guid.NewGuid(),
                FinrateProviderCode = EcbProviderCode,
                FinrateProviderName = "European Central Bank daily reference rates",
                FinrateProviderProviderTypeCode = "official_reference",
                FinrateProviderIsOfficial = true,
                FinrateProviderIsMidMarketSource = true,
                FinrateProviderBaseCurrencyCode = "EUR",
                FinrateProviderApibaseUrl = "https://www.ecb.europa.eu/",
                FinrateProviderSettingsJson = "{}",
                FinrateProviderIsActive = true,
                FinrateProviderCreatedAt = now,
                FinrateProviderCreatedBy = currentUser.UserId,
            };
            db.FinExchangeRateProviders.Add(provider);
        }

        var hash = Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
        var existingImport = await db.FinExchangeRateImports.AsNoTracking()
            .FirstOrDefaultAsync(value =>
                value.FinrateImportProviderId == provider.FinrateProviderId &&
                value.FinrateImportRateDateFrom == feed.RateDate &&
                value.FinrateImportFileHashSha256 == hash,
                cancellationToken);
        if (existingImport is not null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new FinanceExchangeRateRefreshResponse(existingImport.FinrateImportId, feed.RateDate,
                existingImport.FinrateImportRowCount, true, provider.FinrateProviderName, EcbDailyUrl);
        }

        var rateTypeCode = await db.SysFinanceRoetypes.AsNoTracking()
            .Where(type => type.FinroetIsActive && type.FinroetIsOfficial)
            .OrderBy(type => type.FinroetCode == "system_mid_market" ? 0 : 1)
            .ThenBy(type => type.FinroetSortOrder)
            .Select(type => type.FinroetCode)
            .FirstOrDefaultAsync(cancellationToken);
        if (rateTypeCode is null)
        {
            throw WarehouseException.BadRequest("No official exchange-rate type is configured for this workspace.");
        }

        var import = new FinExchangeRateImport
        {
            FinrateImportId = Guid.NewGuid(),
            FinrateImportProviderId = provider.FinrateProviderId,
            FinrateImportImportTypeCode = "official_reference",
            FinrateImportStatusCode = "imported",
            FinrateImportRateDateFrom = feed.RateDate,
            FinrateImportRateDateTo = feed.RateDate,
            FinrateImportSourceUrl = EcbDailyUrl,
            FinrateImportSourceReference = $"ECB daily reference rates {feed.RateDate:yyyy-MM-dd}",
            FinrateImportFileHashSha256 = hash,
            FinrateImportRowCount = importedRates.Count,
            FinrateImportRawPayloadJson = JsonSerializer.Serialize(new
            {
                rateDate = feed.RateDate,
                source = EcbDailyUrl,
                sha256 = hash,
                rates = importedRates,
            }),
            FinrateImportImportedAt = now,
            FinrateImportImportedBy = currentUser.UserId,
        };
        db.FinExchangeRateImports.Add(import);

        var existingRates = await db.FinExchangeRates
            .Where(rate =>
                rate.FinrateProviderId == provider.FinrateProviderId &&
                rate.FinrateFromCurrencyCode == "EUR" &&
                rate.FinrateRateDate == feed.RateDate &&
                rate.FinrateRateTypeCode == rateTypeCode)
            .ToDictionaryAsync(rate => rate.FinrateToCurrencyCode, StringComparer.OrdinalIgnoreCase, cancellationToken);

        foreach (var (currency, value) in importedRates)
        {
            if (!existingRates.TryGetValue(currency, out var rate))
            {
                rate = new FinExchangeRate
                {
                    FinrateId = Guid.NewGuid(),
                    FinrateProviderId = provider.FinrateProviderId,
                    FinrateFromCurrencyCode = "EUR",
                    FinrateToCurrencyCode = currency,
                    FinrateRateDate = feed.RateDate,
                    FinrateValidFrom = feed.RateDate,
                    FinrateRateTypeCode = rateTypeCode,
                };
                db.FinExchangeRates.Add(rate);
            }

            rate.FinrateImportId = import.FinrateImportId;
            rate.FinrateMidRate = value;
            rate.FinrateBuyRate = null;
            rate.FinrateSellRate = null;
            rate.FinrateSourceReference = import.FinrateImportSourceReference;
            rate.FinrateIsOfficial = true;
            rate.FinrateIsApproved = true;
            rate.FinrateImportedAt = now;
            rate.FinrateApprovedAt = now;
            rate.FinrateApprovedBy = currentUser.UserId;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new FinanceExchangeRateRefreshResponse(import.FinrateImportId, feed.RateDate,
            importedRates.Count, false, provider.FinrateProviderName, EcbDailyUrl);
    }

    private static ResolvedRate? Resolve(IReadOnlyList<FinExchangeRate> rates, string from, string to)
    {
        var direct = rates.FirstOrDefault(rate =>
            string.Equals(rate.FinrateFromCurrencyCode, from, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(rate.FinrateToCurrencyCode, to, StringComparison.OrdinalIgnoreCase));
        if (direct?.FinrateMidRate is > 0)
        {
            return FromStored(direct, direct.FinrateMidRate.Value);
        }

        var inverse = rates.FirstOrDefault(rate =>
            string.Equals(rate.FinrateFromCurrencyCode, to, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(rate.FinrateToCurrencyCode, from, StringComparison.OrdinalIgnoreCase));
        if (inverse?.FinrateMidRate is > 0)
        {
            return FromStored(inverse, 1m / inverse.FinrateMidRate.Value);
        }

        var baseLeg = string.Equals(from, "EUR", StringComparison.OrdinalIgnoreCase)
            ? null
            : rates.FirstOrDefault(rate => rate.FinrateFromCurrencyCode == "EUR" &&
                string.Equals(rate.FinrateToCurrencyCode, from, StringComparison.OrdinalIgnoreCase));
        var targetLeg = string.Equals(to, "EUR", StringComparison.OrdinalIgnoreCase)
            ? null
            : rates.FirstOrDefault(rate => rate.FinrateFromCurrencyCode == "EUR" &&
                string.Equals(rate.FinrateToCurrencyCode, to, StringComparison.OrdinalIgnoreCase));
        var baseValue = baseLeg?.FinrateMidRate ?? (from == "EUR" ? 1m : null);
        var targetValue = targetLeg?.FinrateMidRate ?? (to == "EUR" ? 1m : null);
        if (baseValue is not > 0 || targetValue is not > 0)
        {
            return null;
        }

        var rateDate = new[] { baseLeg?.FinrateRateDate, targetLeg?.FinrateRateDate }
            .Where(value => value.HasValue).Select(value => value!.Value).Min();
        var providerNames = new[] { baseLeg?.FinrateProvider.FinrateProviderName, targetLeg?.FinrateProvider.FinrateProviderName }
            .Where(value => !string.IsNullOrWhiteSpace(value)).Distinct().ToList();
        var sources = new[] { baseLeg, targetLeg }.Where(value => value is not null).ToList();
        return new ResolvedRate(
            targetValue.Value / baseValue.Value,
            rateDate,
            string.Join(" / ", providerNames),
            sources.All(rate => rate!.FinrateIsOfficial) ? "reference" : "live",
            string.Join("; ", sources.Select(rate => rate!.FinrateSourceReference).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct()));
    }

    private static ResolvedRate FromStored(FinExchangeRate stored, decimal value) => new(
        value,
        stored.FinrateRateDate,
        stored.FinrateProvider.FinrateProviderName,
        stored.FinrateIsOfficial ? "reference" : stored.FinrateImportId.HasValue ? "live" : "manual",
        stored.FinrateSourceReference);

    private static EcbFeed ParseEcbFeed(byte[] payload)
    {
        using var stream = new MemoryStream(payload, writable: false);
        using var reader = XmlReader.Create(stream, new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            MaxCharactersInDocument = 1_000_000,
            XmlResolver = null,
        });
        var document = XDocument.Load(reader, LoadOptions.None);
        var timeCube = document.Descendants().FirstOrDefault(element => element.Attribute("time") is not null)
            ?? throw WarehouseException.BadRequest("The ECB daily reference feed did not include a rate date.");
        if (!DateOnly.TryParseExact(timeCube.Attribute("time")!.Value, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var rateDate))
        {
            throw WarehouseException.BadRequest("The ECB daily reference feed contained an invalid rate date.");
        }

        var rates = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var cube in timeCube.Elements())
        {
            var code = cube.Attribute("currency")?.Value;
            var rawRate = cube.Attribute("rate")?.Value;
            if (code is null || code.Length != 3 ||
                !decimal.TryParse(rawRate, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) || value <= 0)
            {
                continue;
            }
            rates[code.ToUpperInvariant()] = value;
        }

        if (rates.Count == 0)
        {
            throw WarehouseException.BadRequest("The ECB daily reference feed did not include usable rates.");
        }
        return new EcbFeed(rateDate, rates);
    }

    private static string NormalizeCurrencyCode(string value)
    {
        var code = value.Trim().ToUpperInvariant();
        if (code.Length != 3 || code.Any(character => character is < 'A' or > 'Z'))
        {
            throw WarehouseException.BadRequest("Base currency must be a three-letter ISO code.");
        }
        return code;
    }

    private static int BusinessDaysBetween(DateOnly from, DateOnly to)
    {
        if (from >= to) return 0;
        var count = 0;
        for (var day = from.AddDays(1); day <= to; day = day.AddDays(1))
        {
            if (day.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday) count++;
        }
        return count;
    }

    private sealed record EcbFeed(DateOnly RateDate, IReadOnlyDictionary<string, decimal> Rates);
    private sealed record ResolvedRate(decimal Rate, DateOnly RateDate, string Provider, string Source, string? SourceReference);
}
