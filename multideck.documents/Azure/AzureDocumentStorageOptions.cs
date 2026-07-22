namespace Multideck.Documents.Azure;

public sealed class AzureDocumentStorageOptions
{
    public const string SectionName = "Documents:Azure";

    public string ConnectionString { get; set; } = "";
    public string EnvironmentPrefix { get; set; } = "development";
    public int ReadAccessMinutes { get; set; } = 3;
    public Dictionary<string, string> Containers { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["general"] = "multideck-documents",
        ["warehouse"] = "multideck-warehouse",
        ["jobs"] = "multideck-documents",
        ["customs"] = "multideck-customs",
        ["finance"] = "multideck-finance",
        ["communications"] = "multideck-communications",
        ["generated"] = "multideck-generated",
        ["processing"] = "multideck-processing",
    };

    public string ContainerFor(DocumentConcern concern)
    {
        var code = concern.ToCode();
        if (!Containers.TryGetValue(code, out var container) || string.IsNullOrWhiteSpace(container))
        {
            throw new InvalidOperationException($"No Azure Blob container is configured for document concern '{code}'.");
        }

        return container.Trim().ToLowerInvariant();
    }

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(ConnectionString))
            throw new InvalidOperationException("Documents:Azure:ConnectionString is required.");
        if (ReadAccessMinutes is < 1 or > 60)
            throw new InvalidOperationException("Documents:Azure:ReadAccessMinutes must be between 1 and 60.");
        foreach (var concern in Enum.GetValues<DocumentConcern>()) _ = ContainerFor(concern);
    }
}
