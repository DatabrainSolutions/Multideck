using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowSlaprofile
{
    public Guid WorkflowSlaprofileId { get; set; }

    public string WorkflowSlaprofileCode { get; set; } = null!;

    public string WorkflowSlaprofileName { get; set; } = null!;

    public string? WorkflowSlaprofileDescription { get; set; }

    public Guid? WorkflowSlaprofileOrgOfficeId { get; set; }

    public Guid? WorkflowSlaprofileLegalEntityId { get; set; }

    public Guid? WorkflowSlaprofileBrandId { get; set; }

    public Guid? WorkflowSlaprofileCustomerOrgId { get; set; }

    public string? WorkflowSlaprofileRecordTypeCode { get; set; }

    public string WorkflowSlaprofileTimeZone { get; set; } = null!;

    public string? WorkflowSlaprofileCalendarCode { get; set; }

    public bool WorkflowSlaprofileIsDefault { get; set; }

    public bool WorkflowSlaprofileIsActive { get; set; }

    public string WorkflowSlaprofileSettingsJson { get; set; } = null!;

    public DateTime WorkflowSlaprofileCreatedAt { get; set; }

    public Guid? WorkflowSlaprofileCreatedBy { get; set; }

    public DateTime WorkflowSlaprofileUpdatedAt { get; set; }

    public Guid? WorkflowSlaprofileUpdatedBy { get; set; }

    public virtual CmpBrand? WorkflowSlaprofileBrand { get; set; }

    public virtual CmpUser? WorkflowSlaprofileCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? WorkflowSlaprofileLegalEntity { get; set; }

    public virtual CmpOffice? WorkflowSlaprofileOrgOffice { get; set; }

    public virtual SysWorkflowRecordType? WorkflowSlaprofileRecordTypeCodeNavigation { get; set; }

    public virtual CmpUser? WorkflowSlaprofileUpdatedByNavigation { get; set; }

    public virtual ICollection<WorkflowSlarule> WorkflowSlarules { get; set; } = new List<WorkflowSlarule>();

    public virtual ICollection<WorkflowSlatimer> WorkflowSlatimers { get; set; } = new List<WorkflowSlatimer>();

    public virtual ICollection<WorkflowStep> WorkflowSteps { get; set; } = new List<WorkflowStep>();
}
