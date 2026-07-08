using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdiconnectionStatus
{
    public string EdicsCode { get; set; } = null!;

    public string EdicsName { get; set; } = null!;

    public string? EdicsDescription { get; set; }

    public bool EdicsIsOpen { get; set; }

    public bool EdicsIsFinal { get; set; }

    public bool EdicsIsActive { get; set; }

    public int EdicsSortOrder { get; set; }

    public virtual ICollection<EdiCertification> EdiCertifications { get; set; } = new List<EdiCertification>();

    public virtual ICollection<EdiConnection> EdiConnections { get; set; } = new List<EdiConnection>();

    public virtual ICollection<EdiTradingPartner> EdiTradingPartners { get; set; } = new List<EdiTradingPartner>();
}
