using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDunningItem
{
    public Guid FindunItemId { get; set; }

    public Guid FindunItemRunId { get; set; }

    public Guid? FindunItemDebtCaseId { get; set; }

    public Guid? FindunItemDocumentId { get; set; }

    public Guid? FindunItemCustomerOrgId { get; set; }

    public string FindunItemStatusCode { get; set; } = null!;

    public decimal FindunItemAmount { get; set; }

    public Guid? FindunItemDocumentGeneratedId { get; set; }

    public Guid? FindunItemCommThreadId { get; set; }

    public virtual CommThread? FindunItemCommThread { get; set; }

    public virtual OrgMaster? FindunItemCustomerOrg { get; set; }

    public virtual FinDebtCase? FindunItemDebtCase { get; set; }

    public virtual FinDocument? FindunItemDocument { get; set; }

    public virtual FinDunningRun FindunItemRun { get; set; } = null!;
}
