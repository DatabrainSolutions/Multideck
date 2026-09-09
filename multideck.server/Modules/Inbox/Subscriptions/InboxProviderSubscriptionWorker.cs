using Microsoft.Extensions.Options;

namespace Multideck.Server.Modules.Inbox.Subscriptions;

public sealed class InboxProviderSubscriptionWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<InboxOptions> options,
    ILogger<InboxProviderSubscriptionWorker> logger) : BackgroundService
{
    private readonly InboxOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.EnableWorkers)
        {
            logger.LogInformation("Inbox provider subscription worker is disabled");
            return;
        }

        var nextOAuthStatePurge = DateTimeOffset.MinValue;
        using var timer = new PeriodicTimer(
            TimeSpan.FromSeconds(Math.Clamp(_options.SubscriptionIntervalSeconds, 60, 3600)));
        do
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var service = scope.ServiceProvider.GetRequiredService<IInboxProviderSubscriptionService>();
                await service.MaintainAsync(stoppingToken);
                if (DateTimeOffset.UtcNow >= nextOAuthStatePurge)
                {
                    await service.PurgeExpiredOAuthStatesAsync(stoppingToken);
                    nextOAuthStatePurge = DateTimeOffset.UtcNow.AddHours(
                        Math.Clamp(_options.OAuthStatePurgeIntervalHours, 1, 24));
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Inbox provider subscription worker cycle failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
