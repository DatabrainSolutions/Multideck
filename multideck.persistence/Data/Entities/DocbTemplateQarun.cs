using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplateQarun
{
    public Guid DocbqaId { get; set; }

    public Guid DocbqaTemplateId { get; set; }

    public Guid? DocbqaTemplateVersionId { get; set; }

    public Guid? DocbqaRenderJobId { get; set; }

    public string DocbqaStatusCode { get; set; } = null!;

    public int DocbqaIssueCount { get; set; }

    public int DocbqaBlockingIssueCount { get; set; }

    public string DocbqaRunSettingsJson { get; set; } = null!;

    public DateTime DocbqaStartedAt { get; set; }

    public DateTime? DocbqaCompletedAt { get; set; }

    public Guid? DocbqaCreatedBy { get; set; }

    public virtual ICollection<DocbTemplateQaissue> DocbTemplateQaissues { get; set; } = new List<DocbTemplateQaissue>();

    public virtual CmpUser? DocbqaCreatedByNavigation { get; set; }

    public virtual DocbRenderJob? DocbqaRenderJob { get; set; }

    public virtual DocbDocumentTemplate DocbqaTemplate { get; set; } = null!;

    public virtual DocbTemplateVersion? DocbqaTemplateVersion { get; set; }
}
