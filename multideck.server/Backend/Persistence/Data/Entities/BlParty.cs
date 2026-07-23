using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlParty
{
    public Guid BlpId { get; set; }

    public Guid BlpBlId { get; set; }

    public string BlpRole { get; set; } = null!;

    public Guid? BlpOrgId { get; set; }

    public Guid? BlpAddressId { get; set; }

    public Guid? BlpContactId { get; set; }

    public int BlpSequence { get; set; }

    public bool BlpIsToOrder { get; set; }

    public string? BlpOrderText { get; set; }

    public string BlpDisplayNameSnapshot { get; set; } = null!;

    public string? BlpAddressSnapshot { get; set; }

    public string? BlpContactNameSnapshot { get; set; }

    public string? BlpEmailSnapshot { get; set; }

    public string? BlpPhoneSnapshot { get; set; }

    public string? BlpCountryCodeSnapshot { get; set; }

    public string BlpRawSnapshot { get; set; } = null!;

    public DateTime BlpCreatedAt { get; set; }

    public virtual ICollection<BlPartyIdentifier> BlPartyIdentifiers { get; set; } = new List<BlPartyIdentifier>();

    public virtual BlHeader BlpBl { get; set; } = null!;

    public virtual SysBlpartyRole BlpRoleNavigation { get; set; } = null!;
}
