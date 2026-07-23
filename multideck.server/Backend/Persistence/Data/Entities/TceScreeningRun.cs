using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceScreeningRun
{
    public Guid TcerunId { get; set; }

    public string TcerunNumber { get; set; } = null!;

    public string TcerunRunTypeCode { get; set; } = null!;

    public string TcerunStatusCode { get; set; } = null!;

    public Guid? TcerunPolicyId { get; set; }

    public Guid? TcerunJobId { get; set; }

    public Guid? TcerunJobDocumentId { get; set; }

    public Guid? TcerunCustomerOrgId { get; set; }

    public Guid? TcerunOrgOfficeId { get; set; }

    public Guid? TcerunLegalEntityId { get; set; }

    public Guid? TcerunBrandId { get; set; }

    public string? TcerunSourceRecordTypeCode { get; set; }

    public string? TcerunSourceTable { get; set; }

    public Guid? TcerunSourceId { get; set; }

    public Guid? TcerunTriggeredBy { get; set; }

    public DateTime TcerunTriggeredAt { get; set; }

    public DateTime? TcerunCompletedAt { get; set; }

    public int TcerunSubjectCount { get; set; }

    public int TcerunMatchCount { get; set; }

    public int TcerunOpenCaseCount { get; set; }

    public decimal TcerunHighestScore { get; set; }

    public string TcerunHighestRiskLevelCode { get; set; } = null!;

    public string? TcerunSummary { get; set; }

    public string TcerunMetadataJson { get; set; } = null!;

    public DateTime TcerunCreatedAt { get; set; }

    public Guid? TcerunCreatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCase> TceComplianceCases { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceHold> TceComplianceHolds { get; set; } = new List<TceComplianceHold>();

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();

    public virtual ICollection<TceScreeningSubject> TceScreeningSubjects { get; set; } = new List<TceScreeningSubject>();

    public virtual CmpBrand? TcerunBrand { get; set; }

    public virtual CmpUser? TcerunCreatedByNavigation { get; set; }

    public virtual OrgMaster? TcerunCustomerOrg { get; set; }

    public virtual SysTceriskLevel TcerunHighestRiskLevelCodeNavigation { get; set; } = null!;

    public virtual JobHeader? TcerunJob { get; set; }

    public virtual JobDocument? TcerunJobDocument { get; set; }

    public virtual CmpLegalEntity? TcerunLegalEntity { get; set; }

    public virtual CmpOffice? TcerunOrgOffice { get; set; }

    public virtual TceScreeningPolicy? TcerunPolicy { get; set; }

    public virtual SysTcescreeningRunType TcerunRunTypeCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowRecordType? TcerunSourceRecordTypeCodeNavigation { get; set; }

    public virtual SysTcescreeningStatus TcerunStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TcerunTriggeredByNavigation { get; set; }
}
