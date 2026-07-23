using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventoryTransaction
{
    public Guid WmstransactionId { get; set; }

    public Guid WmstransactionFacilityId { get; set; }

    public Guid? WmstransactionBalanceId { get; set; }

    public string WmstransactionTypeCode { get; set; } = null!;

    public Guid WmstransactionItemId { get; set; }

    public Guid? WmstransactionCustomerOrgId { get; set; }

    public Guid? WmstransactionFromLocationId { get; set; }

    public Guid? WmstransactionToLocationId { get; set; }

    public Guid? WmstransactionLotId { get; set; }

    public Guid? WmstransactionSerialId { get; set; }

    public Guid? WmstransactionHuId { get; set; }

    public decimal WmstransactionQuantity { get; set; }

    public string WmstransactionUomcode { get; set; } = null!;

    public decimal? WmstransactionBeforeOnHandQuantity { get; set; }

    public decimal? WmstransactionAfterOnHandQuantity { get; set; }

    public string WmstransactionInventoryStatusCode { get; set; } = null!;

    public string WmstransactionCustomsStatusCode { get; set; } = null!;

    public Guid? WmstransactionOrderId { get; set; }

    public Guid? WmstransactionOrderLineId { get; set; }

    public Guid? WmstransactionReceiptId { get; set; }

    public Guid? WmstransactionTaskId { get; set; }

    public Guid? WmstransactionJobId { get; set; }

    public string? WmstransactionSourceTable { get; set; }

    public Guid? WmstransactionSourceId { get; set; }

    public string? WmstransactionReference { get; set; }

    public string? WmstransactionNotes { get; set; }

    public string WmstransactionMetadataJson { get; set; } = null!;

    public DateTime WmstransactionCreatedAt { get; set; }

    public Guid? WmstransactionCreatedBy { get; set; }

    public virtual ICollection<WmsAdjustmentLine> WmsAdjustmentLines { get; set; } = new List<WmsAdjustmentLine>();

    public virtual ICollection<WmsBondedMovement> WmsBondedMovements { get; set; } = new List<WmsBondedMovement>();

    public virtual ICollection<WmsInventoryTransactionLink> WmsInventoryTransactionLinks { get; set; } = new List<WmsInventoryTransactionLink>();

    public virtual ICollection<WmsReceiptLine> WmsReceiptLines { get; set; } = new List<WmsReceiptLine>();

    public virtual WmsInventoryBalance? WmstransactionBalance { get; set; }

    public virtual CmpUser? WmstransactionCreatedByNavigation { get; set; }

    public virtual OrgMaster? WmstransactionCustomerOrg { get; set; }

    public virtual SysWmscustomsStatus WmstransactionCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual WmsFacility WmstransactionFacility { get; set; } = null!;

    public virtual WmsLocation? WmstransactionFromLocation { get; set; }

    public virtual WmsHandlingUnit? WmstransactionHu { get; set; }

    public virtual SysWmsinventoryStatus WmstransactionInventoryStatusCodeNavigation { get; set; } = null!;

    public virtual WmsItem WmstransactionItem { get; set; } = null!;

    public virtual JobHeader? WmstransactionJob { get; set; }

    public virtual WmsInventoryLot? WmstransactionLot { get; set; }

    public virtual WmsOrder? WmstransactionOrder { get; set; }

    public virtual WmsOrderLine? WmstransactionOrderLine { get; set; }

    public virtual WmsReceipt? WmstransactionReceipt { get; set; }

    public virtual WmsInventorySerial? WmstransactionSerial { get; set; }

    public virtual WmsTask? WmstransactionTask { get; set; }

    public virtual WmsLocation? WmstransactionToLocation { get; set; }

    public virtual SysWmstransactionType WmstransactionTypeCodeNavigation { get; set; } = null!;
}
