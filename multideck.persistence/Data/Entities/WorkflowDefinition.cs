using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowDefinition
{
    public Guid WorkflowDefId { get; set; }

    public string WorkflowDefCode { get; set; } = null!;

    public string WorkflowDefName { get; set; } = null!;

    public string? WorkflowDefDescription { get; set; }

    public string WorkflowDefStatusCode { get; set; } = null!;

    public string WorkflowDefRecordTypeCode { get; set; } = null!;

    public string? WorkflowDefModuleCode { get; set; }

    public Guid? WorkflowDefOrgOfficeId { get; set; }

    public Guid? WorkflowDefLegalEntityId { get; set; }

    public Guid? WorkflowDefBrandId { get; set; }

    public Guid? WorkflowDefCustomerOrgId { get; set; }

    public string? WorkflowDefModeCode { get; set; }

    public string? WorkflowDefDirectionCode { get; set; }

    public string? WorkflowDefCountryCode { get; set; }

    public string WorkflowDefLanguageCode { get; set; } = null!;

    public string WorkflowDefTimeZone { get; set; } = null!;

    public bool WorkflowDefIsSystem { get; set; }

    public bool WorkflowDefIsDefault { get; set; }

    public bool WorkflowDefIsActive { get; set; }

    public string WorkflowDefSettingsJson { get; set; } = null!;

    public Guid? WorkflowDefCurrentVersionId { get; set; }

    public DateTime WorkflowDefCreatedAt { get; set; }

    public Guid? WorkflowDefCreatedBy { get; set; }

    public DateTime WorkflowDefUpdatedAt { get; set; }

    public Guid? WorkflowDefUpdatedBy { get; set; }

    public bool WorkflowDefIsDeleted { get; set; }

    public virtual CmpBrand? WorkflowDefBrand { get; set; }

    public virtual CmpUser? WorkflowDefCreatedByNavigation { get; set; }

    public virtual WorkflowDefinitionVersion? WorkflowDefCurrentVersion { get; set; }

    public virtual CmpLegalEntity? WorkflowDefLegalEntity { get; set; }

    public virtual CmpOffice? WorkflowDefOrgOffice { get; set; }

    public virtual SysWorkflowRecordType WorkflowDefRecordTypeCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowDefinitionStatus WorkflowDefStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? WorkflowDefUpdatedByNavigation { get; set; }

    public virtual ICollection<WorkflowDefinitionVersion> WorkflowDefinitionVersions { get; set; } = new List<WorkflowDefinitionVersion>();

    public virtual ICollection<WorkflowInstance> WorkflowInstances { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowLegacyLink> WorkflowLegacyLinks { get; set; } = new List<WorkflowLegacyLink>();
}
