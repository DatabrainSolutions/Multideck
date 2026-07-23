using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessageTemplateVersion
{
    public Guid CommTemplateVerId { get; set; }

    public Guid CommTemplateVerTemplateId { get; set; }

    public int CommTemplateVerVersionNo { get; set; }

    public string CommTemplateVerStatusCode { get; set; } = null!;

    public string? CommTemplateVerSubjectTemplate { get; set; }

    public string? CommTemplateVerBodyTextTemplate { get; set; }

    public string? CommTemplateVerBodyHtmltemplate { get; set; }

    public string? CommTemplateVerDataScopeCode { get; set; }

    public Guid? CommTemplateVerDocBuilderTemplateId { get; set; }

    public Guid? CommTemplateVerDocBuilderTemplateVersionId { get; set; }

    public string? CommTemplateVerChangeSummary { get; set; }

    public string CommTemplateVerSampleDataJson { get; set; } = null!;

    public DateTime CommTemplateVerCreatedAt { get; set; }

    public Guid? CommTemplateVerCreatedBy { get; set; }

    public DateTime? CommTemplateVerApprovedAt { get; set; }

    public Guid? CommTemplateVerApprovedBy { get; set; }

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommAidraftResponse> CommAidraftResponses { get; set; } = new List<CommAidraftResponse>();

    public virtual ICollection<CommMessageTemplate> CommMessageTemplates { get; set; } = new List<CommMessageTemplate>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();

    public virtual CmpUser? CommTemplateVerApprovedByNavigation { get; set; }

    public virtual CmpUser? CommTemplateVerCreatedByNavigation { get; set; }

    public virtual SysDocBuilderDataScope? CommTemplateVerDataScopeCodeNavigation { get; set; }

    public virtual DocbDocumentTemplate? CommTemplateVerDocBuilderTemplate { get; set; }

    public virtual DocbTemplateVersion? CommTemplateVerDocBuilderTemplateVersion { get; set; }

    public virtual SysCommTemplateStatus CommTemplateVerStatusCodeNavigation { get; set; } = null!;

    public virtual CommMessageTemplate CommTemplateVerTemplate { get; set; } = null!;
}
