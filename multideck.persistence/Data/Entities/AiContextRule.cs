using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiContextRule
{
    public Guid AicrId { get; set; }

    public string AicrScopeType { get; set; } = null!;

    public string? AicrDomainCode { get; set; }

    public string AicrRuleType { get; set; } = null!;

    public Guid? AicrCompanyId { get; set; }

    public Guid? AicrOrgOfficeId { get; set; }

    public Guid? AicrLegalEntityId { get; set; }

    public Guid? AicrBrandId { get; set; }

    public Guid? AicrUserRoleId { get; set; }

    public Guid? AicrUserId { get; set; }

    public string? AicrTitle { get; set; }

    public string AicrRuleText { get; set; } = null!;

    public string AicrRuleJson { get; set; } = null!;

    public int AicrPriority { get; set; }

    public string AicrStatus { get; set; } = null!;

    public string? AicrSourceTable { get; set; }

    public Guid? AicrSourceId { get; set; }

    public DateOnly? AicrEffectiveFrom { get; set; }

    public DateOnly? AicrEffectiveTo { get; set; }

    public DateTime? AicrApprovedAt { get; set; }

    public Guid? AicrApprovedBy { get; set; }

    public DateTime AicrCreatedAt { get; set; }

    public Guid? AicrCreatedBy { get; set; }

    public DateTime AicrUpdatedAt { get; set; }

    public Guid? AicrUpdatedBy { get; set; }

    public virtual CmpBrand? AicrBrand { get; set; }

    public virtual CmpCompany? AicrCompany { get; set; }

    public virtual SysAicontextDomain? AicrDomainCodeNavigation { get; set; }

    public virtual CmpLegalEntity? AicrLegalEntity { get; set; }

    public virtual CmpOffice? AicrOrgOffice { get; set; }

    public virtual SysAicontextRuleType AicrRuleTypeNavigation { get; set; } = null!;

    public virtual SysAicontextScopeType AicrScopeTypeNavigation { get; set; } = null!;

    public virtual SysAicontextItemStatus AicrStatusNavigation { get; set; } = null!;

    public virtual CmpUser? AicrUser { get; set; }

    public virtual SysUserRole? AicrUserRole { get; set; }
}
