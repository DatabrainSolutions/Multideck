using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommUserNotificationPreference
{
    public Guid CommNotifPrefId { get; set; }

    public Guid CommNotifPrefUserId { get; set; }

    public string CommNotifPrefChannelCode { get; set; } = null!;

    public string CommNotifPrefEventType { get; set; } = null!;

    public bool CommNotifPrefIsEnabled { get; set; }

    public string CommNotifPrefDeliveryChannelsJson { get; set; } = null!;

    public string CommNotifPrefQuietHoursJson { get; set; } = null!;

    public DateTime CommNotifPrefCreatedAt { get; set; }

    public DateTime CommNotifPrefUpdatedAt { get; set; }

    public virtual SysCommChannel CommNotifPrefChannelCodeNavigation { get; set; } = null!;

    public virtual CmpUser CommNotifPrefUser { get; set; } = null!;
}
