using Multideck.Server.Modules.Inbox.Luna;
using Multideck.Server.Modules.Inbox.OAuth;
using Multideck.Server.Modules.Inbox.Processing;
using Multideck.Server.Modules.Inbox.Providers;
using Multideck.Server.Modules.Inbox.Security;
using Multideck.Server.Modules.Inbox.Subscriptions;

namespace Multideck.Server.Modules.Inbox;

public static class InboxServiceCollectionExtensions
{
    public static IServiceCollection AddInboxModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<InboxOptions>(configuration.GetSection(InboxOptions.SectionName));
        services.AddScoped<InboxExceptionFilter>();
        services.AddScoped<IInboxActorContext, InboxActorContext>();
        services.AddScoped<IInboxAccessPolicy, InboxAccessPolicy>();
        services.AddScoped<IInboxCredentialVault, SupabaseVaultInboxCredentialVault>();
        services.AddScoped<IEmailProviderCatalog, EmailProviderCatalog>();
        services.AddScoped<IInboxService, InboxService>();
        services.AddScoped<IInboxAttachmentService, InboxAttachmentService>();
        services.AddScoped<IInboxThreadSummaryStore, InboxThreadSummaryStore>();
        services.AddScoped<IInboxSyncProcessor, InboxSyncProcessor>();
        services.AddScoped<IInboxSendProcessor, InboxSendProcessor>();

        services.AddHttpClient<GmailEmailProviderClient>(client =>
        {
            client.BaseAddress = new Uri("https://www.googleapis.com/");
            client.Timeout = TimeSpan.FromSeconds(60);
        });
        services.AddHttpClient<MicrosoftGraphEmailProviderClient>(client =>
        {
            client.BaseAddress = new Uri("https://graph.microsoft.com/");
            client.Timeout = TimeSpan.FromSeconds(60);
        });
        services.AddScoped<IEmailProviderClient>(provider => provider.GetRequiredService<GmailEmailProviderClient>());
        services.AddScoped<IEmailProviderClient>(provider => provider.GetRequiredService<MicrosoftGraphEmailProviderClient>());
        services.AddHttpClient<InboxOAuthService>(client => client.Timeout = TimeSpan.FromSeconds(30));
        services.AddScoped<IInboxOAuthService>(provider => provider.GetRequiredService<InboxOAuthService>());
        services.AddHttpClient<LunaThreadSummaryService>(client => client.Timeout = TimeSpan.FromSeconds(90));
        services.AddScoped<ILunaThreadSummaryService>(provider => provider.GetRequiredService<LunaThreadSummaryService>());
        services.AddHttpClient<InboxProviderSubscriptionService>(client => client.Timeout = TimeSpan.FromSeconds(30));
        services.AddScoped<IInboxProviderSubscriptionService>(provider => provider.GetRequiredService<InboxProviderSubscriptionService>());
        services.AddHostedService<InboxSyncWorker>();
        services.AddHostedService<InboxSendWorker>();
        services.AddHostedService<InboxProviderSubscriptionWorker>();
        return services;
    }
}
