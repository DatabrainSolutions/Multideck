namespace Multideck.Documents;

/// <summary>
/// Stable business boundaries used for container routing, retention policies and access control.
/// Add a concern only when it represents a materially different security or lifecycle boundary.
/// </summary>
public enum DocumentConcern
{
    General,
    Warehouse,
    Jobs,
    Customs,
    Finance,
    Communications,
    Generated,
    Processing,
}

public static class DocumentConcernExtensions
{
    public static string ToCode(this DocumentConcern concern) => concern.ToString().ToLowerInvariant();
}
