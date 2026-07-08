using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinVarianceCase
{
    public Guid FinvarCaseId { get; set; }

    public string FinvarCaseTypeCode { get; set; } = null!;

    public string FinvarCaseStatusCode { get; set; } = null!;

    public Guid? FinvarCaseJobId { get; set; }

    public Guid? FinvarCaseDocumentId { get; set; }

    public Guid? FinvarCasePartyOrgId { get; set; }

    public decimal FinvarCaseExpectedAmount { get; set; }

    public decimal FinvarCaseActualAmount { get; set; }

    public decimal FinvarCaseVarianceAmount { get; set; }

    public decimal FinvarCaseLocalVarianceAmount { get; set; }

    public string FinvarCaseCurrencyCodeSnapshot { get; set; } = null!;

    public decimal FinvarCaseMarginImpactAmount { get; set; }

    public string FinvarCaseTitle { get; set; } = null!;

    public string? FinvarCaseExplanation { get; set; }

    public DateTime FinvarCaseCreatedAt { get; set; }

    public Guid? FinvarCaseCreatedBy { get; set; }

    public virtual ICollection<FinVarianceApproval> FinVarianceApprovals { get; set; } = new List<FinVarianceApproval>();

    public virtual ICollection<FinVarianceItem> FinVarianceItems { get; set; } = new List<FinVarianceItem>();

    public virtual ICollection<FinVariancePosting> FinVariancePostings { get; set; } = new List<FinVariancePosting>();

    public virtual CmpUser? FinvarCaseCreatedByNavigation { get; set; }

    public virtual FinDocument? FinvarCaseDocument { get; set; }

    public virtual JobHeader? FinvarCaseJob { get; set; }

    public virtual OrgMaster? FinvarCasePartyOrg { get; set; }

    public virtual SysFinanceVarianceStatus FinvarCaseStatusCodeNavigation { get; set; } = null!;

    public virtual SysFinanceVarianceType FinvarCaseTypeCodeNavigation { get; set; } = null!;
}
