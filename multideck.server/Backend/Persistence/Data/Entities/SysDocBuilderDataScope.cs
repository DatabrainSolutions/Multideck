using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderDataScope
{
    public string DocbscCode { get; set; } = null!;

    public string DocbscName { get; set; } = null!;

    public string? DocbscDescription { get; set; }

    public int DocbscSortOrder { get; set; }

    public bool DocbscIsActive { get; set; }

    public DateTime DocbscCreatedAt { get; set; }

    public virtual ICollection<CommMessageTemplateVersion> CommMessageTemplateVersions { get; set; } = new List<CommMessageTemplateVersion>();

    public virtual ICollection<DocbClauseLibrary> DocbClauseLibraries { get; set; } = new List<DocbClauseLibrary>();

    public virtual ICollection<DocbDataSource> DocbDataSources { get; set; } = new List<DocbDataSource>();

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbLibraryDocument> DocbLibraryDocuments { get; set; } = new List<DocbLibraryDocument>();

    public virtual ICollection<DocbLibraryPackItem> DocbLibraryPackItems { get; set; } = new List<DocbLibraryPackItem>();

    public virtual ICollection<DocbLibraryPack> DocbLibraryPacks { get; set; } = new List<DocbLibraryPack>();

    public virtual ICollection<DocbSectionDefinition> DocbSectionDefinitions { get; set; } = new List<DocbSectionDefinition>();

    public virtual ICollection<DocsecSecurityProfile> DocsecSecurityProfiles { get; set; } = new List<DocsecSecurityProfile>();
}
