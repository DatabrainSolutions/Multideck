using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInboundQueue
{
    public Guid? WmsorderId { get; set; }

    public Guid? WmsorderFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public string? WmsorderOrderNumber { get; set; }

    public string? WmsorderTypeCode { get; set; }

    public string? WmsorderStatusCode { get; set; }

    public Guid? WmsorderCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public Guid? WmsorderJobId { get; set; }

    public DateTime? WmsorderAppointmentStartAt { get; set; }

    public int? LineCount { get; set; }

    public decimal? ExpectedQuantity { get; set; }

    public decimal? ReceivedQuantity { get; set; }
}
