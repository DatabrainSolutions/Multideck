using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsReceipt
{
    public Guid WmsreceiptId { get; set; }

    public Guid WmsreceiptFacilityId { get; set; }

    public Guid? WmsreceiptOrderId { get; set; }

    public Guid? WmsreceiptAdviceId { get; set; }

    public Guid? WmsreceiptJobId { get; set; }

    public string WmsreceiptReceiptNumber { get; set; } = null!;

    public string WmsreceiptStatusCode { get; set; } = null!;

    public Guid? WmsreceiptDockId { get; set; }

    public Guid? WmsreceiptReceivingLocationId { get; set; }

    public DateTime? WmsreceiptReceivedAt { get; set; }

    public Guid? WmsreceiptReceivedBy { get; set; }

    public bool WmsreceiptHasDiscrepancy { get; set; }

    public string? WmsreceiptNotes { get; set; }

    public string WmsreceiptMetadataJson { get; set; } = null!;

    public DateTime WmsreceiptCreatedAt { get; set; }

    public Guid? WmsreceiptCreatedBy { get; set; }

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsReceiptDiscrepancy> WmsReceiptDiscrepancies { get; set; } = new List<WmsReceiptDiscrepancy>();

    public virtual ICollection<WmsReceiptLine> WmsReceiptLines { get; set; } = new List<WmsReceiptLine>();

    public virtual WmsInboundAdvice? WmsreceiptAdvice { get; set; }

    public virtual CmpUser? WmsreceiptCreatedByNavigation { get; set; }

    public virtual WmsDock? WmsreceiptDock { get; set; }

    public virtual WmsFacility WmsreceiptFacility { get; set; } = null!;

    public virtual JobHeader? WmsreceiptJob { get; set; }

    public virtual WmsOrder? WmsreceiptOrder { get; set; }

    public virtual CmpUser? WmsreceiptReceivedByNavigation { get; set; }

    public virtual WmsLocation? WmsreceiptReceivingLocation { get; set; }
}
