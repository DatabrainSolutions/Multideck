using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommDeliveryEvent
{
    public Guid CommDeliveryId { get; set; }

    public Guid? CommDeliveryMessageId { get; set; }

    public Guid? CommDeliverySendId { get; set; }

    public Guid? CommDeliveryConnectionId { get; set; }

    public string CommDeliveryEventTypeCode { get; set; } = null!;

    public string? CommDeliveryStatusCode { get; set; }

    public string? CommDeliveryProviderEventId { get; set; }

    public string? CommDeliveryProviderMessageId { get; set; }

    public DateTime CommDeliveryEventAt { get; set; }

    public DateTime CommDeliveryReceivedAt { get; set; }

    public string? CommDeliveryErrorCode { get; set; }

    public string? CommDeliveryErrorMessage { get; set; }

    public string CommDeliveryPayloadJson { get; set; } = null!;

    public string? CommDeliveryRawHashSha256 { get; set; }

    public virtual CommProviderConnection? CommDeliveryConnection { get; set; }

    public virtual SysCommDeliveryEventType CommDeliveryEventTypeCodeNavigation { get; set; } = null!;

    public virtual CommMessage? CommDeliveryMessage { get; set; }

    public virtual CommSendRequest? CommDeliverySend { get; set; }

    public virtual SysCommMessageStatus? CommDeliveryStatusCodeNavigation { get; set; }
}
