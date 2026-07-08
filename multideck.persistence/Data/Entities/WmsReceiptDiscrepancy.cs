using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsReceiptDiscrepancy
{
    public Guid WmsreceiptDiscId { get; set; }

    public Guid WmsreceiptDiscReceiptId { get; set; }

    public Guid? WmsreceiptDiscReceiptLineId { get; set; }

    public string WmsreceiptDiscExceptionTypeCode { get; set; } = null!;

    public string WmsreceiptDiscStatusCode { get; set; } = null!;

    public decimal? WmsreceiptDiscExpectedQuantity { get; set; }

    public decimal? WmsreceiptDiscActualQuantity { get; set; }

    public string WmsreceiptDiscDescription { get; set; } = null!;

    public string WmsreceiptDiscPhotoEvidenceJson { get; set; } = null!;

    public Guid? WmsreceiptDiscWorkflowTaskId { get; set; }

    public DateTime WmsreceiptDiscCreatedAt { get; set; }

    public Guid? WmsreceiptDiscCreatedBy { get; set; }

    public virtual CmpUser? WmsreceiptDiscCreatedByNavigation { get; set; }

    public virtual SysWmsexceptionType WmsreceiptDiscExceptionTypeCodeNavigation { get; set; } = null!;

    public virtual WmsReceipt WmsreceiptDiscReceipt { get; set; } = null!;

    public virtual WmsReceiptLine? WmsreceiptDiscReceiptLine { get; set; }

    public virtual WorkflowTask? WmsreceiptDiscWorkflowTask { get; set; }
}
