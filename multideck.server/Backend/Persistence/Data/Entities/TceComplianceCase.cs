using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceComplianceCase
{
    public Guid TcecaseId { get; set; }

    public string TcecaseNumber { get; set; } = null!;

    public string TcecaseStatusCode { get; set; } = null!;

    public string TcecaseRiskLevelCode { get; set; } = null!;

    public Guid? TcecaseRunId { get; set; }

    public Guid? TcecaseSubjectId { get; set; }

    public Guid? TcecaseJobId { get; set; }

    public Guid? TcecaseCustomerOrgId { get; set; }

    public Guid? TcecaseOrgOfficeId { get; set; }

    public string TcecaseTitle { get; set; } = null!;

    public string? TcecaseSummary { get; set; }

    public Guid? TcecaseAssignedUserId { get; set; }

    public Guid? TcecaseWorkflowTaskId { get; set; }

    public DateTime? TcecaseDueAt { get; set; }

    public DateTime? TcecaseClosedAt { get; set; }

    public Guid? TcecaseClosedBy { get; set; }

    public string TcecaseMetadataJson { get; set; } = null!;

    public DateTime TcecaseCreatedAt { get; set; }

    public Guid? TcecaseCreatedBy { get; set; }

    public DateTime TcecaseUpdatedAt { get; set; }

    public Guid? TcecaseUpdatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceCaseDecision> TceCaseDecisions { get; set; } = new List<TceCaseDecision>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceHold> TceComplianceHolds { get; set; } = new List<TceComplianceHold>();

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();

    public virtual CmpUser? TcecaseAssignedUser { get; set; }

    public virtual CmpUser? TcecaseClosedByNavigation { get; set; }

    public virtual CmpUser? TcecaseCreatedByNavigation { get; set; }

    public virtual OrgMaster? TcecaseCustomerOrg { get; set; }

    public virtual JobHeader? TcecaseJob { get; set; }

    public virtual CmpOffice? TcecaseOrgOffice { get; set; }

    public virtual SysTceriskLevel TcecaseRiskLevelCodeNavigation { get; set; } = null!;

    public virtual TceScreeningRun? TcecaseRun { get; set; }

    public virtual SysTcecaseStatus TcecaseStatusCodeNavigation { get; set; } = null!;

    public virtual TceScreeningSubject? TcecaseSubject { get; set; }

    public virtual CmpUser? TcecaseUpdatedByNavigation { get; set; }

    public virtual WorkflowTask? TcecaseWorkflowTask { get; set; }
}
