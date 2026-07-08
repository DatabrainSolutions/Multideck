using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplateVersion
{
    public Guid DocbtvId { get; set; }

    public Guid DocbtvTemplateId { get; set; }

    public int DocbtvVersionNo { get; set; }

    public string DocbtvStatusCode { get; set; } = null!;

    public string DocbtvRenderEngineCode { get; set; } = null!;

    public string DocbtvOutputFormatCode { get; set; } = null!;

    public Guid? DocbtvThemeId { get; set; }

    public string DocbtvTemplateSnapshotJson { get; set; } = null!;

    public string? DocbtvChangeReason { get; set; }

    public DateTime? DocbtvPublishedAt { get; set; }

    public Guid? DocbtvPublishedBy { get; set; }

    public DateTime DocbtvCreatedAt { get; set; }

    public Guid? DocbtvCreatedBy { get; set; }

    public virtual ICollection<CommMessageTemplateVersion> CommMessageTemplateVersions { get; set; } = new List<CommMessageTemplateVersion>();

    public virtual ICollection<DocbGeneratedDocument> DocbGeneratedDocuments { get; set; } = new List<DocbGeneratedDocument>();

    public virtual ICollection<DocbRenderJob> DocbRenderJobs { get; set; } = new List<DocbRenderJob>();

    public virtual ICollection<DocbTemplateClauseLink> DocbTemplateClauseLinks { get; set; } = new List<DocbTemplateClauseLink>();

    public virtual ICollection<DocbTemplatePage> DocbTemplatePages { get; set; } = new List<DocbTemplatePage>();

    public virtual ICollection<DocbTemplateQarun> DocbTemplateQaruns { get; set; } = new List<DocbTemplateQarun>();

    public virtual ICollection<DocbTemplateSection> DocbTemplateSections { get; set; } = new List<DocbTemplateSection>();

    public virtual CmpUser? DocbtvCreatedByNavigation { get; set; }

    public virtual SysDocBuilderOutputFormat DocbtvOutputFormatCodeNavigation { get; set; } = null!;

    public virtual CmpUser? DocbtvPublishedByNavigation { get; set; }

    public virtual SysDocBuilderRenderEngine DocbtvRenderEngineCodeNavigation { get; set; } = null!;

    public virtual SysDocBuilderStatus DocbtvStatusCodeNavigation { get; set; } = null!;

    public virtual DocbDocumentTemplate DocbtvTemplate { get; set; } = null!;

    public virtual DocbTheme? DocbtvTheme { get; set; }
}
