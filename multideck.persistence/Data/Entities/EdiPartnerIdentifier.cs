using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiPartnerIdentifier
{
    public Guid EdipiId { get; set; }

    public Guid EdipiTradingPartnerId { get; set; }

    public string? EdipiStandardCode { get; set; }

    public string EdipiIdentifierType { get; set; } = null!;

    public string? EdipiQualifier { get; set; }

    public string EdipiIdentifierValue { get; set; } = null!;

    public string EdipiDirectionCode { get; set; } = null!;

    public bool EdipiIsPrimary { get; set; }

    public bool EdipiIsActive { get; set; }

    public DateTime EdipiCreatedAt { get; set; }

    public virtual SysEdidirection EdipiDirectionCodeNavigation { get; set; } = null!;

    public virtual SysEdistandard? EdipiStandardCodeNavigation { get; set; }

    public virtual EdiTradingPartner EdipiTradingPartner { get; set; } = null!;
}
