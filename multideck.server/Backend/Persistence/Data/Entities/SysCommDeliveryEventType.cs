using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommDeliveryEventType
{
    public string CommDeliveryEventTypeCode { get; set; } = null!;

    public string CommDeliveryEventTypeName { get; set; } = null!;

    public string? CommDeliveryEventTypeDescription { get; set; }

    public int CommDeliveryEventTypeSortOrder { get; set; }

    public bool CommDeliveryEventTypeIsActive { get; set; }

    public DateTime CommDeliveryEventTypeCreatedAt { get; set; }

    public virtual ICollection<CommDeliveryEvent> CommDeliveryEvents { get; set; } = new List<CommDeliveryEvent>();
}
