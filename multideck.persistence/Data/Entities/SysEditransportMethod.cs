using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEditransportMethod
{
    public string EditmCode { get; set; } = null!;

    public string EditmName { get; set; } = null!;

    public string? EditmDescription { get; set; }

    public bool EditmRequiresExternalProvider { get; set; }

    public bool EditmCanBeDirectConnector { get; set; }

    public bool EditmIsActive { get; set; }

    public int EditmSortOrder { get; set; }

    public virtual ICollection<EdiConnection> EdiConnections { get; set; } = new List<EdiConnection>();

    public virtual ICollection<EdiServiceProvider> EdiServiceProviders { get; set; } = new List<EdiServiceProvider>();

    public virtual ICollection<EdiTradingPartner> EdiTradingPartners { get; set; } = new List<EdiTradingPartner>();
}
