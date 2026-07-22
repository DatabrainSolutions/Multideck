namespace Multideck.Server.Modules.Finance;

public sealed record FinanceCurrencyDto(
    string Code,
    string Name,
    string Symbol,
    int DecimalPlaces,
    bool IsActive,
    string? UnitName,
    string? SubunitName,
    int? SubunitRatio,
    string? SymbolPosition);

public sealed record FinanceCurrenciesResponse(
    IReadOnlyList<FinanceCurrencyDto> Currencies,
    DateOnly? AsOf);

public sealed record FinanceExchangeRateDto(
    string BaseCurrency,
    string Currency,
    decimal? Rate,
    decimal? CostRate,
    decimal? SellRate,
    string Source,
    string Status,
    string? Provider,
    DateOnly? EffectiveAt,
    int? BusinessDaysOld,
    string? SourceReference);

public sealed record FinanceExchangeRatesResponse(
    string BaseCurrency,
    IReadOnlyList<FinanceExchangeRateDto> Rates,
    DateOnly? AsOf);

public sealed record FinanceExchangeRateRefreshResponse(
    Guid ImportId,
    DateOnly RateDate,
    int RateCount,
    bool AlreadyImported,
    string Provider,
    string Source);
