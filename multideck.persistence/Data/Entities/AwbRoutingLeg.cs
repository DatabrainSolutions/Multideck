using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Carrier routing legs for AWB movement, including first and onward carrier segments.
/// </summary>
public partial class AwbRoutingLeg
{
    public Guid AwbrlId { get; set; }

    public Guid AwbrlAwbid { get; set; }

    public int AwbrlLegNumber { get; set; }

    public string? AwbrlLegType { get; set; }

    public Guid? AwbrlCarrierOrgId { get; set; }

    public string? AwbrlCarrierNameSnapshot { get; set; }

    public string? AwbrlCarrierIatacodeSnapshot { get; set; }

    public string? AwbrlFlightNumber { get; set; }

    public Guid? AwbrlFromAirportId { get; set; }

    public string? AwbrlFromAirportCodeSnapshot { get; set; }

    public Guid? AwbrlToAirportId { get; set; }

    public string? AwbrlToAirportCodeSnapshot { get; set; }

    public DateTime? AwbrlScheduledDeparture { get; set; }

    public DateTime? AwbrlScheduledArrival { get; set; }

    public DateTime? AwbrlActualDeparture { get; set; }

    public DateTime? AwbrlActualArrival { get; set; }

    public string? AwbrlBookingReference { get; set; }

    public string? AwbrlStatus { get; set; }

    public string? AwbrlNotes { get; set; }

    public DateTime AwbrlCreatedAt { get; set; }

    public virtual AwbHeader AwbrlAwb { get; set; } = null!;

    public virtual SysAwbroutingLegType? AwbrlLegTypeNavigation { get; set; }
}
