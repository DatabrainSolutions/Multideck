using System.Security.Claims;

namespace Multideck.Server.Modules.Finance;

public interface IFinanceRateService
{
    Task<FinanceCurrenciesResponse> GetCurrenciesAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<FinanceExchangeRatesResponse> GetExchangeRatesAsync(ClaimsPrincipal user, string baseCurrency, CancellationToken cancellationToken);
    Task<FinanceExchangeRateRefreshResponse> RefreshEcbRatesAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
}
