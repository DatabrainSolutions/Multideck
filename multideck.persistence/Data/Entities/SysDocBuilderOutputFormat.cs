using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderOutputFormat
{
    public string DocbofCode { get; set; } = null!;

    public string DocbofName { get; set; } = null!;

    public string? DocbofMimeType { get; set; }

    public int DocbofSortOrder { get; set; }

    public bool DocbofIsActive { get; set; }

    public DateTime DocbofCreatedAt { get; set; }

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbGeneratedDocument> DocbGeneratedDocuments { get; set; } = new List<DocbGeneratedDocument>();

    public virtual ICollection<DocbLibraryDocument> DocbLibraryDocuments { get; set; } = new List<DocbLibraryDocument>();

    public virtual ICollection<DocbLibraryPackItem> DocbLibraryPackItems { get; set; } = new List<DocbLibraryPackItem>();

    public virtual ICollection<DocbRenderJob> DocbRenderJobs { get; set; } = new List<DocbRenderJob>();

    public virtual ICollection<DocbTemplateVersion> DocbTemplateVersions { get; set; } = new List<DocbTemplateVersion>();
}
