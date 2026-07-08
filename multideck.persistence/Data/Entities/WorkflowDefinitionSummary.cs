using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowDefinitionSummary
{
    public Guid? WorkflowDefId { get; set; }

    public string? WorkflowDefCode { get; set; }

    public string? WorkflowDefName { get; set; }

    public string? WorkflowDefRecordTypeCode { get; set; }

    public string? WorkflowDefStatusCode { get; set; }

    public Guid? WorkflowDefOrgOfficeId { get; set; }

    public string? WorkflowDefOfficeName { get; set; }

    public Guid? WorkflowDefLegalEntityId { get; set; }

    public string? WorkflowDefLegalEntityName { get; set; }

    public Guid? WorkflowDefBrandId { get; set; }

    public string? WorkflowDefBrandName { get; set; }

    public Guid? WorkflowDefCustomerOrgId { get; set; }

    public string? WorkflowDefModeCode { get; set; }

    public string? WorkflowDefDirectionCode { get; set; }

    public Guid? WorkflowDefCurrentVersionId { get; set; }

    public int? WorkflowDefCurrentVersionNo { get; set; }

    public string? WorkflowDefCurrentVersionStatus { get; set; }

    public int? WorkflowDefStepCount { get; set; }

    public bool? WorkflowDefIsDefault { get; set; }

    public bool? WorkflowDefIsActive { get; set; }

    public DateTime? WorkflowDefUpdatedAt { get; set; }
}
