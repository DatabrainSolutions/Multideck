using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderStatus
{
    public string DocbstCode { get; set; } = null!;

    public string DocbstName { get; set; } = null!;

    public bool DocbstIsFinal { get; set; }

    public int DocbstSortOrder { get; set; }

    public bool DocbstIsActive { get; set; }

    public DateTime DocbstCreatedAt { get; set; }

    public virtual ICollection<DocbClauseLibrary> DocbClauseLibraries { get; set; } = new List<DocbClauseLibrary>();

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbLibraryDocument> DocbLibraryDocuments { get; set; } = new List<DocbLibraryDocument>();

    public virtual ICollection<DocbLibraryPack> DocbLibraryPacks { get; set; } = new List<DocbLibraryPack>();

    public virtual ICollection<DocbSectionDefinition> DocbSectionDefinitions { get; set; } = new List<DocbSectionDefinition>();

    public virtual ICollection<DocbSectionVersion> DocbSectionVersions { get; set; } = new List<DocbSectionVersion>();

    public virtual ICollection<DocbTemplateVersion> DocbTemplateVersions { get; set; } = new List<DocbTemplateVersion>();
}
