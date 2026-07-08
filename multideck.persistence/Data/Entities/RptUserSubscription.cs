using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptUserSubscription
{
    public Guid RptuserSubId { get; set; }

    public Guid RptuserSubUserId { get; set; }

    public Guid? RptuserSubDashboardId { get; set; }

    public Guid? RptuserSubReportId { get; set; }

    public string RptuserSubFrequencyCode { get; set; } = null!;

    public string RptuserSubDeliveryChannelCode { get; set; } = null!;

    public bool RptuserSubIsActive { get; set; }

    public DateTime RptuserSubCreatedAt { get; set; }

    public virtual RptDashboard? RptuserSubDashboard { get; set; }

    public virtual SysRptrefreshFrequency RptuserSubFrequencyCodeNavigation { get; set; } = null!;

    public virtual RptReportDefinition? RptuserSubReport { get; set; }

    public virtual CmpUser RptuserSubUser { get; set; } = null!;
}
