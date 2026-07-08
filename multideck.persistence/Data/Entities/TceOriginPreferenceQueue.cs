using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceOriginPreferenceQueue
{
    public Guid? TceprefId { get; set; }

    public string? TceprefStatusCode { get; set; }

    public string? TceftacheckStatusName { get; set; }

    public Guid? TceprefJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? TceprefJobCargoId { get; set; }

    public string? TceftaCode { get; set; }

    public string? TceftaName { get; set; }

    public string? TceprefHscode { get; set; }

    public string? TceprefOriginCountryCode { get; set; }

    public string? TceprefDestinationCountryCode { get; set; }

    public decimal? TceprefDutyRateStandardPercent { get; set; }

    public decimal? TceprefDutyRatePreferencePercent { get; set; }

    public decimal? TceprefEstimatedDutySavingAmount { get; set; }

    public string? TceprefCurrencyCodeSnapshot { get; set; }

    public Guid? TceprefEvidenceDocumentId { get; set; }

    public Guid? TceprefReviewedBy { get; set; }

    public DateTime? TceprefReviewedAt { get; set; }

    public DateTime? TceprefCreatedAt { get; set; }
}
