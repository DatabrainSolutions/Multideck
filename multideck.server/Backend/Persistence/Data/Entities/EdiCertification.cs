using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiCertification
{
    public Guid EdicertId { get; set; }

    public Guid EdicertTradingPartnerId { get; set; }

    public Guid? EdicertMessageProfileId { get; set; }

    public Guid? EdicertMappingVersionId { get; set; }

    public string? EdicertCertificationReference { get; set; }

    public string EdicertStatusCode { get; set; } = null!;

    public DateTime? EdicertStartedAt { get; set; }

    public DateTime? EdicertPassedAt { get; set; }

    public DateTime? EdicertExpiresAt { get; set; }

    public string? EdicertEvidenceRef { get; set; }

    public string? EdicertNotes { get; set; }

    public DateTime EdicertCreatedAt { get; set; }

    public Guid? EdicertCreatedBy { get; set; }

    public virtual CmpUser? EdicertCreatedByNavigation { get; set; }

    public virtual EdiMappingVersion? EdicertMappingVersion { get; set; }

    public virtual EdiMessageProfile? EdicertMessageProfile { get; set; }

    public virtual SysEdiconnectionStatus EdicertStatusCodeNavigation { get; set; } = null!;

    public virtual EdiTradingPartner EdicertTradingPartner { get; set; } = null!;
}
