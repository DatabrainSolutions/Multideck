using Multideck.Documents;
using Multideck.Documents.Azure;
using Multideck.Documents.Paths;

namespace Multideck.Server.Modules.Documents;

public static class DocumentServiceCollectionExtensions
{
    public static IServiceCollection AddDocumentStorage(this IServiceCollection services, IConfiguration configuration)
    {
        var options = new AzureDocumentStorageOptions();
        configuration.GetSection(AzureDocumentStorageOptions.SectionName).Bind(options);
        services.AddSingleton(options);
        services.AddSingleton<IDocumentPathPolicy, ConcernDocumentPathPolicy>();
        services.AddSingleton<IDocumentStorage, AzureBlobDocumentStorage>();
        services.AddScoped<IDocumentObjectService, DocumentObjectService>();
        return services;
    }
}
