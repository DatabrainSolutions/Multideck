namespace Multideck.Persistence.Entities;

public sealed class DocStoredObject
{
    public Guid DocStoredObjectId { get; set; }
    public string DocStoredObjectConcernCode { get; set; } = null!;
    public Guid? DocStoredObjectOrganisationId { get; set; }
    public string DocStoredObjectAggregateType { get; set; } = null!;
    public Guid DocStoredObjectAggregateId { get; set; }
    public string DocStoredObjectProviderCode { get; set; } = null!;
    public string DocStoredObjectContainer { get; set; } = null!;
    public string DocStoredObjectBlobName { get; set; } = null!;
    public string DocStoredObjectOriginalFileName { get; set; } = null!;
    public string DocStoredObjectMimeType { get; set; } = null!;
    public long DocStoredObjectFileSizeBytes { get; set; }
    public string DocStoredObjectSha256 { get; set; } = null!;
    public string? DocStoredObjectEtag { get; set; }
    public string? DocStoredObjectVersionId { get; set; }
    public string DocStoredObjectStatusCode { get; set; } = null!;
    public DateTime DocStoredObjectCreatedAt { get; set; }
    public Guid? DocStoredObjectCreatedBy { get; set; }
    public Guid? DocStoredObjectCreatedByPortalUserId { get; set; }
    public DateTime? DocStoredObjectDeletedAt { get; set; }
    public Guid? DocStoredObjectDeletedBy { get; set; }

    public OrgMaster? DocStoredObjectOrganisation { get; set; }
    public CmpUser? DocStoredObjectCreatedByNavigation { get; set; }
    public PortalUser? DocStoredObjectCreatedByPortalUser { get; set; }
    public CmpUser? DocStoredObjectDeletedByNavigation { get; set; }
}
