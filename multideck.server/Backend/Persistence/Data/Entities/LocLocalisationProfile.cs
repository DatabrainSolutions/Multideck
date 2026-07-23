using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocLocalisationProfile
{
    public Guid LocprofileId { get; set; }

    public Guid? CompanyId { get; set; }

    public string LocprofileCode { get; set; } = null!;

    public string LocprofileName { get; set; } = null!;

    public string? LocprofileDescription { get; set; }

    public string LocprofileLocaleCode { get; set; } = null!;

    public string LocprofileTimeZoneCode { get; set; } = null!;

    public string LocprofileDateFormatCode { get; set; } = null!;

    public string LocprofileTimeFormatCode { get; set; } = null!;

    public string LocprofileNumberFormatCode { get; set; } = null!;

    public string LocprofileMeasurementSystemCode { get; set; } = null!;

    public string LocprofilePaperSizeCode { get; set; } = null!;

    public string LocprofileWeekStartCode { get; set; } = null!;

    public string LocprofileDisplayTimeZoneModeCode { get; set; } = null!;

    public string? LocprofileCurrencyCode { get; set; }

    public string LocprofileSettingsJson { get; set; } = null!;

    public bool LocprofileIsSystem { get; set; }

    public bool LocprofileIsDefault { get; set; }

    public bool LocprofileIsActive { get; set; }

    public DateTime LocprofileCreatedAt { get; set; }

    public Guid? LocprofileCreatedBy { get; set; }

    public DateTime LocprofileUpdatedAt { get; set; }

    public Guid? LocprofileUpdatedBy { get; set; }

    public virtual CmpCompany? Company { get; set; }

    public virtual ICollection<LocProfileScope> LocProfileScopes { get; set; } = new List<LocProfileScope>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();

    public virtual CmpUser? LocprofileCreatedByNavigation { get; set; }

    public virtual SysLocdateFormat LocprofileDateFormatCodeNavigation { get; set; } = null!;

    public virtual SysLocdisplayTimeZoneMode LocprofileDisplayTimeZoneModeCodeNavigation { get; set; } = null!;

    public virtual SysLoclocale LocprofileLocaleCodeNavigation { get; set; } = null!;

    public virtual SysLocmeasurementSystem LocprofileMeasurementSystemCodeNavigation { get; set; } = null!;

    public virtual SysLocnumberFormat LocprofileNumberFormatCodeNavigation { get; set; } = null!;

    public virtual SysLocpaperSize LocprofilePaperSizeCodeNavigation { get; set; } = null!;

    public virtual SysLoctimeFormat LocprofileTimeFormatCodeNavigation { get; set; } = null!;

    public virtual SysLoctimeZone LocprofileTimeZoneCodeNavigation { get; set; } = null!;

    public virtual CmpUser? LocprofileUpdatedByNavigation { get; set; }

    public virtual SysLocweekStartDay LocprofileWeekStartCodeNavigation { get; set; } = null!;
}
