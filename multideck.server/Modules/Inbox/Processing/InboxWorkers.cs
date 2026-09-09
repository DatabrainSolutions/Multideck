using Microsoft.Extensions.Options;

namespace Multideck.Server.Modules.Inbox.Processing;

public sealed class InboxSyncWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<InboxOptions> options,
    ILogger<InboxSyncWorker> logger) : BackgroundService
{
    private readonly InboxOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.EnableWorkers)
        {
            logger.LogInformation("Inbox sync worker is disabled");
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(Math.Clamp(_options.SyncIntervalSeconds, 15, 3600)));
        do
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IInboxSyncProcessor>().ProcessDueAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception exception) { logger.LogError(exception, "Inbox sync worker cycle failed"); }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

public sealed class InboxSendWorker(
    IServiceScopeFactory scopeFactory,
    IOptions<InboxOptions> options,
    ILogger<InboxSendWorker> logger) : BackgroundService
{
    private readonly InboxOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.EnableWorkers)
        {
            logger.LogInformation("Inbox send worker is disabled");
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(Math.Clamp(_options.SendIntervalSeconds, 2, 300)));
        do
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IInboxSendProcessor>().ProcessDueAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception exception) { logger.LogError(exception, "Inbox send worker cycle failed"); }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
