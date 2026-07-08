using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceHsclassificationQueue
{
    public Guid? TceclassId { get; set; }

    public string? TceclassStatusCode { get; set; }

    public string? TceclassStatusName { get; set; }

    public Guid? TceclassJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? TceclassJobCargoId { get; set; }

    public Guid? TceclassCustomerOrgId { get; set; }

    public string? TceclassCustomerName { get; set; }

    public string? TceclassGoodsDescription { get; set; }

    public string? TceclassHscode { get; set; }

    public string? TceclassEccncode { get; set; }

    public string? TceclassControlCode { get; set; }

    public decimal? TceclassConfidenceScore { get; set; }

    public Guid? TceclassReviewedBy { get; set; }

    public DateTime? TceclassReviewedAt { get; set; }

    public DateTime? TceclassCreatedAt { get; set; }

    public int? TceclassCandidateCount { get; set; }
}
