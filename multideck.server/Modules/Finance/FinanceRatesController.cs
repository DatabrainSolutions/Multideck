using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Finance;

[ApiController]
[Route("api/finance")]
[Produces("application/json")]
[TypeFilter(typeof(WarehouseExceptionFilter))]
public sealed class FinanceRatesController(IFinanceRateService financeRates) : ControllerBase
{
    [HttpGet("currencies")]
    [RequirePermission(AppPermissions.Quotes.ReadValue)]
    public async Task<ActionResult<FinanceCurrenciesResponse>> Currencies(CancellationToken cancellationToken)
        => Ok(await financeRates.GetCurrenciesAsync(User, cancellationToken));

    [HttpGet("exchange-rates")]
    [RequirePermission(AppPermissions.Quotes.ReadValue)]
    public async Task<ActionResult<FinanceExchangeRatesResponse>> ExchangeRates(
        [FromQuery(Name = "base")] string baseCurrency = "GBP",
        CancellationToken cancellationToken = default)
        => Ok(await financeRates.GetExchangeRatesAsync(User, baseCurrency, cancellationToken));

    [HttpPost("exchange-rates/refresh")]
    [RequirePermission(AppPermissions.Integrations.ManageValue)]
    public async Task<ActionResult<FinanceExchangeRateRefreshResponse>> Refresh(CancellationToken cancellationToken)
        => Ok(await financeRates.RefreshEcbRatesAsync(User, cancellationToken));
}
