using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDebtCase
{
    public Guid FindebtCaseId { get; set; }

    public Guid FindebtCaseCustomerOrgId { get; set; }

    public Guid? FindebtCaseDocumentId { get; set; }

    public string FindebtCaseStatusCode { get; set; } = null!;

    public string FindebtCaseSeverityCode { get; set; } = null!;

    public decimal FindebtCaseOverdueAmount { get; set; }

    public decimal FindebtCaseLocalOverdueAmount { get; set; }

    public DateOnly? FindebtCaseOldestDueDate { get; set; }

    public DateTime? FindebtCaseNextActionDueAt { get; set; }

    public Guid? FindebtCaseAssignedUserId { get; set; }

    public Guid? FindebtCaseAiinsightId { get; set; }

    public DateTime FindebtCaseCreatedAt { get; set; }

    public DateTime? FindebtCaseClosedAt { get; set; }

    public virtual ICollection<FinDebtAction> FinDebtActions { get; set; } = new List<FinDebtAction>();

    public virtual ICollection<FinDunningItem> FinDunningItems { get; set; } = new List<FinDunningItem>();

    public virtual FinAiinsight? FindebtCaseAiinsight { get; set; }

    public virtual CmpUser? FindebtCaseAssignedUser { get; set; }

    public virtual OrgMaster FindebtCaseCustomerOrg { get; set; } = null!;

    public virtual FinDocument? FindebtCaseDocument { get; set; }

    public virtual SysFinanceInsightSeverity FindebtCaseSeverityCodeNavigation { get; set; } = null!;
}
