using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbRenderJob
{
    public Guid DocbrjId { get; set; }

    public Guid DocbrjTemplateId { get; set; }

    public Guid? DocbrjTemplateVersionId { get; set; }

    public string DocbrjStatusCode { get; set; } = null!;

    public string DocbrjRenderEngineCode { get; set; } = null!;

    public string DocbrjOutputFormatCode { get; set; } = null!;

    public string DocbrjTargetTable { get; set; } = null!;

    public Guid DocbrjTargetId { get; set; }

    public Guid? DocbrjJobId { get; set; }

    public Guid? DocbrjJobDocumentId { get; set; }

    public string DocbrjInputSnapshotJson { get; set; } = null!;

    public string DocbrjRenderSettingsJson { get; set; } = null!;

    public DateTime? DocbrjStartedAt { get; set; }

    public DateTime? DocbrjCompletedAt { get; set; }

    public string? DocbrjErrorMessage { get; set; }

    public DateTime DocbrjCreatedAt { get; set; }

    public Guid? DocbrjCreatedBy { get; set; }

    public virtual ICollection<DocbGeneratedDocument> DocbGeneratedDocuments { get; set; } = new List<DocbGeneratedDocument>();

    public virtual ICollection<DocbRenderedPage> DocbRenderedPages { get; set; } = new List<DocbRenderedPage>();

    public virtual ICollection<DocbTemplateQarun> DocbTemplateQaruns { get; set; } = new List<DocbTemplateQarun>();

    public virtual CmpUser? DocbrjCreatedByNavigation { get; set; }

    public virtual JobHeader? DocbrjJob { get; set; }

    public virtual JobDocument? DocbrjJobDocument { get; set; }

    public virtual SysDocBuilderOutputFormat DocbrjOutputFormatCodeNavigation { get; set; } = null!;

    public virtual SysDocBuilderRenderEngine DocbrjRenderEngineCodeNavigation { get; set; } = null!;

    public virtual SysDocBuilderRenderStatus DocbrjStatusCodeNavigation { get; set; } = null!;

    public virtual DocbDocumentTemplate DocbrjTemplate { get; set; } = null!;

    public virtual DocbTemplateVersion? DocbrjTemplateVersion { get; set; }
}
