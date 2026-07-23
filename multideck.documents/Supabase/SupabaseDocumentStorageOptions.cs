namespace Multideck.Documents.Supabase;

public sealed class SupabaseDocumentStorageOptions
{
    public const string SectionName = "Documents:Supabase";

    public string Url { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string EnvironmentPrefix { get; set; } = "development";
    public int ReadAccessMinutes { get; set; } = 3;
    public Dictionary<string, string> Buckets { get; set; } = new(StringComparer.OrdinalIgnoreCase)
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

    public string BucketFor(DocumentConcern concern)
    {
        var code = concern.ToCode();
        if (!Buckets.TryGetValue(code, out var bucket) || string.IsNullOrWhiteSpace(bucket))
        {
            throw new InvalidOperationException($"No Supabase Storage bucket is configured for document concern '{code}'.");
        }

        return bucket.Trim().ToLowerInvariant();
    }

    public void Validate()
    {
        if (!Uri.TryCreate(Url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
            throw new InvalidOperationException("Documents:Supabase:Url must be an absolute HTTP or HTTPS Supabase project URL.");
        if (string.IsNullOrWhiteSpace(ApiKey))
            throw new InvalidOperationException("A Supabase server secret is required for document storage.");
        if (ReadAccessMinutes is < 1 or > 60)
            throw new InvalidOperationException("Documents:Supabase:ReadAccessMinutes must be between 1 and 60.");
        foreach (var concern in Enum.GetValues<DocumentConcern>()) _ = BucketFor(concern);
    }
}
