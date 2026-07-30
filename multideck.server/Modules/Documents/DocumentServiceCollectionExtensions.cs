using Multideck.Documents;
using Multideck.Documents.Paths;
using Multideck.Documents.Supabase;

namespace Multideck.Server.Modules.Documents;

public static class DocumentServiceCollectionExtensions
{
    public static IServiceCollection AddDocumentStorage(this IServiceCollection services, IConfiguration configuration)
    {
        var options = new SupabaseDocumentStorageOptions();
        configuration.GetSection(SupabaseDocumentStorageOptions.SectionName).Bind(options);
        options.Url = FirstConfigured(options.Url, configuration["Supabase:Url"]);
        options.ApiKey = FirstConfigured(
            options.ApiKey,
            configuration["Supabase:SecretKey"],
            configuration["Supabase:ServiceRoleKey"]);

        services.AddSingleton(options);
        services.AddSingleton<IDocumentPathPolicy, ConcernDocumentPathPolicy>();
        services.AddHttpClient("SupabaseDocumentStorage", client =>
            client.Timeout = TimeSpan.FromMinutes(10));
        services.AddSingleton<IDocumentStorage>(provider =>
        {
            // Keep unrelated API modules available when local document-storage credentials have
            // not been configured. The storage module still fails closed when it is first used.
            options.Validate();
            return new SupabaseDocumentStorage(
                options,
                provider.GetRequiredService<IHttpClientFactory>().CreateClient("SupabaseDocumentStorage"),
                provider.GetRequiredService<IDocumentPathPolicy>());
        });
        services.AddScoped<IDocumentObjectService, DocumentObjectService>();
        return services;
    }

    private static string FirstConfigured(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? "";
}
