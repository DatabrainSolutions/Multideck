using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsException
{
    public Guid WmsexceptionId { get; set; }

    public Guid WmsexceptionFacilityId { get; set; }

    public string WmsexceptionTypeCode { get; set; } = null!;

    public string WmsexceptionStatusCode { get; set; } = null!;

    public string WmsexceptionSeverityCode { get; set; } = null!;

    public Guid? WmsexceptionOrderId { get; set; }

    public Guid? WmsexceptionOrderLineId { get; set; }

    public Guid? WmsexceptionTaskId { get; set; }

    public Guid? WmsexceptionReceiptId { get; set; }

    public Guid? WmsexceptionBalanceId { get; set; }

    public Guid? WmsexceptionJobId { get; set; }

    public string WmsexceptionTitle { get; set; } = null!;

    public string? WmsexceptionDescription { get; set; }

    public Guid? WmsexceptionWorkflowTaskId { get; set; }

    public DateTime WmsexceptionRaisedAt { get; set; }

    public Guid? WmsexceptionRaisedBy { get; set; }

    public DateTime? WmsexceptionResolvedAt { get; set; }

    public Guid? WmsexceptionResolvedBy { get; set; }

    public string WmsexceptionMetadataJson { get; set; } = null!;

    public virtual ICollection<WmsAiinsight> WmsAiinsights { get; set; } = new List<WmsAiinsight>();

    public virtual ICollection<WmsExceptionAction> WmsExceptionActions { get; set; } = new List<WmsExceptionAction>();

    public virtual WmsInventoryBalance? WmsexceptionBalance { get; set; }

    public virtual WmsFacility WmsexceptionFacility { get; set; } = null!;

    public virtual JobHeader? WmsexceptionJob { get; set; }

    public virtual WmsOrder? WmsexceptionOrder { get; set; }

    public virtual WmsOrderLine? WmsexceptionOrderLine { get; set; }

    public virtual CmpUser? WmsexceptionRaisedByNavigation { get; set; }

    public virtual WmsReceipt? WmsexceptionReceipt { get; set; }

    public virtual CmpUser? WmsexceptionResolvedByNavigation { get; set; }

    public virtual WmsTask? WmsexceptionTask { get; set; }

    public virtual SysWmsexceptionType WmsexceptionTypeCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WmsexceptionWorkflowTask { get; set; }
}
