using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlPrintSummary
{
    public Guid? BlId { get; set; }

    public Guid? BlJobId { get; set; }

    public string? BlNumber { get; set; }

    public string? BlStatus { get; set; }

    public DateOnly? BlDocumentDate { get; set; }

    public DateTime? BlIssueDateTime { get; set; }

    public int? BlNumberOfOriginals { get; set; }

    public int? BlNumberOfCopies { get; set; }

    public bool? BlNegotiable { get; set; }

    public bool? BlToOrder { get; set; }

    public string? BlConsignor { get; set; }

    public string? BlConsignee { get; set; }

    public string? BlNotifyParties { get; set; }

    public string? BlPlaceOfReceipt { get; set; }

    public string? BlPortOfLoading { get; set; }

    public string? BlPortOfDischarge { get; set; }

    public string? BlPlaceOfDelivery { get; set; }

    public decimal? BlTotalPackages { get; set; }

    public decimal? BlTotalGrossWeight { get; set; }
}
