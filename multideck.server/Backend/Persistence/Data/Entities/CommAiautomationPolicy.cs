using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommAiautomationPolicy
{
    public Guid CommAipolicyId { get; set; }

    public string CommAipolicyCode { get; set; } = null!;

    public string CommAipolicyName { get; set; } = null!;

    public string? CommAipolicyDescription { get; set; }

    public string CommAipolicyStatusCode { get; set; } = null!;

    public string CommAipolicyActionCode { get; set; } = null!;

    public string? CommAipolicyChannelCode { get; set; }

    public Guid? CommAipolicyMailboxId { get; set; }

    public Guid? CommAipolicyOrgOfficeId { get; set; }

    public Guid? CommAipolicyLegalEntityId { get; set; }

    public Guid? CommAipolicyBrandId { get; set; }

    public Guid? CommAipolicyCustomerOrgId { get; set; }

    public Guid? CommAipolicyModelId { get; set; }

    public Guid? CommAipolicyPromptTemplateId { get; set; }

    public Guid? CommAipolicyResponseTemplateVersionId { get; set; }

    public decimal CommAipolicyMinConfidence { get; set; }

    public bool CommAipolicyAutoSendEnabled { get; set; }

    public bool CommAipolicyRequireHumanReview { get; set; }

    public bool CommAipolicyRespectConsent { get; set; }

    public int CommAipolicyMaxAutoResponsesPerThread { get; set; }

    public int CommAipolicyCooldownMinutes { get; set; }

    public string CommAipolicyAllowedIntentJson { get; set; } = null!;

    public string CommAipolicyBlockedIntentJson { get; set; } = null!;

    public string CommAipolicyConditionJson { get; set; } = null!;

    public string CommAipolicyActionJson { get; set; } = null!;

    public int CommAipolicySortOrder { get; set; }

    public DateTime CommAipolicyCreatedAt { get; set; }

    public Guid? CommAipolicyCreatedBy { get; set; }

    public DateTime? CommAipolicyApprovedAt { get; set; }

    public Guid? CommAipolicyApprovedBy { get; set; }

    public DateTime CommAipolicyUpdatedAt { get; set; }

    public Guid? CommAipolicyUpdatedBy { get; set; }

    public virtual ICollection<CommAidraftResponse> CommAidraftResponses { get; set; } = new List<CommAidraftResponse>();

    public virtual SysCommAiaction CommAipolicyActionCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommAipolicyApprovedByNavigation { get; set; }

    public virtual CmpBrand? CommAipolicyBrand { get; set; }

    public virtual SysCommChannel? CommAipolicyChannelCodeNavigation { get; set; }

    public virtual CmpUser? CommAipolicyCreatedByNavigation { get; set; }

    public virtual OrgMaster? CommAipolicyCustomerOrg { get; set; }

    public virtual CmpLegalEntity? CommAipolicyLegalEntity { get; set; }

    public virtual CommMailbox? CommAipolicyMailbox { get; set; }

    public virtual AiModel? CommAipolicyModel { get; set; }

    public virtual CmpOffice? CommAipolicyOrgOffice { get; set; }

    public virtual AiPromptTemplate? CommAipolicyPromptTemplate { get; set; }

    public virtual CommMessageTemplateVersion? CommAipolicyResponseTemplateVersion { get; set; }

    public virtual ICollection<CommAipolicyRun> CommAipolicyRuns { get; set; } = new List<CommAipolicyRun>();

    public virtual SysCommAipolicyStatus CommAipolicyStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommAipolicyUpdatedByNavigation { get; set; }
}
