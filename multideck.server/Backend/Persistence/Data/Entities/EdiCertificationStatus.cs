using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiCertificationStatus
{
    public Guid? EdicertId { get; set; }

    public Guid? EdicertTradingPartnerId { get; set; }

    public string? EditpName { get; set; }

    public Guid? EdicertMessageProfileId { get; set; }

    public string? EdimpName { get; set; }

    public string? EdimpMessageTypeCode { get; set; }

    public string? EdimpDirectionCode { get; set; }

    public string? EdimpStandardCode { get; set; }

    public string? EdicertCertificationReference { get; set; }

    public string? EdicertStatusCode { get; set; }

    public DateTime? EdicertStartedAt { get; set; }

    public DateTime? EdicertPassedAt { get; set; }

    public DateTime? EdicertExpiresAt { get; set; }

    public string? EdicertEvidenceRef { get; set; }
}
