using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderRenderEngine
{
    public string DocbreCode { get; set; } = null!;

    public string DocbreName { get; set; } = null!;

    public string? DocbreDescription { get; set; }

    public bool DocbreIsExternal { get; set; }

    public int DocbreSortOrder { get; set; }

    public bool DocbreIsActive { get; set; }

    public DateTime DocbreCreatedAt { get; set; }

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbLibraryDocument> DocbLibraryDocuments { get; set; } = new List<DocbLibraryDocument>();

    public virtual ICollection<DocbRenderJob> DocbRenderJobs { get; set; } = new List<DocbRenderJob>();

    public virtual ICollection<DocbTemplateVersion> DocbTemplateVersions { get; set; } = new List<DocbTemplateVersion>();
}
