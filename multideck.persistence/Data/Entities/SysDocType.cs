using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocType
{
    public Guid DocTypesPk { get; set; }

    public string? DocTypesReferenceType { get; set; }

    public string? DocTypesDesc { get; set; }

    public bool? DocTypesIsPublished { get; set; }

    public bool? DocTypesIsPublishUpdatable { get; set; }

    public bool? DocTypesSaveVersions { get; set; }

    public bool? DocTypesLogSystemCreatedDocsToEdocs { get; set; }

    public DateTime? DocTypesSystemCreatedTime { get; set; }

    public Guid? DocTypesSystemCreatedBy { get; set; }

    public DateTime? DocTypesSystemLastEditedDate { get; set; }

    public Guid? DocTypesSystemLastEditedBy { get; set; }

    public string? DocTypesDocType { get; set; }

    public string? DocTypesParseType { get; set; }

    public bool? DocTypesIsDefaultPeriodic { get; set; }

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbLibraryDocument> DocbLibraryDocuments { get; set; } = new List<DocbLibraryDocument>();

    public virtual ICollection<DocbLibraryPackItem> DocbLibraryPackItems { get; set; } = new List<DocbLibraryPackItem>();

    public virtual ICollection<DocsecSecurityProfile> DocsecSecurityProfiles { get; set; } = new List<DocsecSecurityProfile>();

    public virtual ICollection<JobDocument> JobDocuments { get; set; } = new List<JobDocument>();
}
