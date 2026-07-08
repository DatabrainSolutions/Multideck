using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPaymentRunItem
{
    public Guid FinpayRunItemId { get; set; }

    public Guid FinpayRunItemRunId { get; set; }

    public Guid FinpayRunItemDocumentId { get; set; }

    public Guid? FinpayRunItemSupplierOrgId { get; set; }

    public string FinpayRunItemStatusCode { get; set; } = null!;

    public decimal FinpayRunItemAmount { get; set; }

    public decimal FinpayRunItemLocalAmount { get; set; }

    public Guid? FinpayRunItemCashId { get; set; }

    public virtual FinCashTransaction? FinpayRunItemCash { get; set; }

    public virtual FinDocument FinpayRunItemDocument { get; set; } = null!;

    public virtual FinPaymentRun FinpayRunItemRun { get; set; } = null!;

    public virtual OrgMaster? FinpayRunItemSupplierOrg { get; set; }
}
