using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1PrintSummary
{
    public Guid? T1Id { get; set; }

    public Guid? T1JobId { get; set; }

    public string? T1DeclarationType { get; set; }

    public string? T1Status { get; set; }

    public string? T1Lrn { get; set; }

    public string? T1Mrn { get; set; }

    public Guid? T1OrgOfficeId { get; set; }

    public string? T1OfficeCodeSnapshot { get; set; }

    public string? T1DepartureOfficeCode { get; set; }

    public string? T1DestinationOfficeCode { get; set; }

    public string? T1HolderNameSnapshot { get; set; }

    public string? T1ConsigneeNameSnapshot { get; set; }

    public int? T1ItemCount { get; set; }

    public decimal? T1TotalGrossMass { get; set; }

    public int? T1TotalPackages { get; set; }

    public string? T1ICustomsStatusSnapshot { get; set; }
}
