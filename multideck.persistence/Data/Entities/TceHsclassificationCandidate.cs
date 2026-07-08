using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceHsclassificationCandidate
{
    public Guid TceclassCandId { get; set; }

    public Guid TceclassCandClassificationId { get; set; }

    public string TceclassCandHscode { get; set; } = null!;

    public string? TceclassCandHscodeFormatted { get; set; }

    public string? TceclassCandDescription { get; set; }

    public decimal? TceclassCandConfidenceScore { get; set; }

    public string? TceclassCandRationale { get; set; }

    public string TceclassCandSourceCode { get; set; } = null!;

    public bool TceclassCandIsSelected { get; set; }

    public DateTime TceclassCandCreatedAt { get; set; }

    public virtual TceHsclassification TceclassCandClassification { get; set; } = null!;
}
