using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocUserPreference
{
    public Guid LocuserPrefId { get; set; }

    public Guid UserId { get; set; }

    public Guid? LocprofileId { get; set; }

    public string? LocuserPrefLocaleCode { get; set; }

    public string? LocuserPrefTimeZoneCode { get; set; }

    public string? LocuserPrefDateFormatCode { get; set; }

    public string? LocuserPrefTimeFormatCode { get; set; }

    public string? LocuserPrefNumberFormatCode { get; set; }

    public string? LocuserPrefMeasurementSystemCode { get; set; }

    public string? LocuserPrefPaperSizeCode { get; set; }

    public string? LocuserPrefWeekStartCode { get; set; }

    public string? LocuserPrefCurrencyCode { get; set; }

    public string LocuserPrefDisplayTimeZoneModeCode { get; set; } = null!;

    public string LocuserPrefSettingsJson { get; set; } = null!;

    public bool LocuserPrefIsActive { get; set; }

    public DateTime LocuserPrefCreatedAt { get; set; }

    public DateTime LocuserPrefUpdatedAt { get; set; }

    public virtual LocLocalisationProfile? Locprofile { get; set; }

    public virtual SysLocdateFormat? LocuserPrefDateFormatCodeNavigation { get; set; }

    public virtual SysLocdisplayTimeZoneMode LocuserPrefDisplayTimeZoneModeCodeNavigation { get; set; } = null!;

    public virtual SysLoclocale? LocuserPrefLocaleCodeNavigation { get; set; }

    public virtual SysLocmeasurementSystem? LocuserPrefMeasurementSystemCodeNavigation { get; set; }

    public virtual SysLocnumberFormat? LocuserPrefNumberFormatCodeNavigation { get; set; }

    public virtual SysLocpaperSize? LocuserPrefPaperSizeCodeNavigation { get; set; }

    public virtual SysLoctimeFormat? LocuserPrefTimeFormatCodeNavigation { get; set; }

    public virtual SysLoctimeZone? LocuserPrefTimeZoneCodeNavigation { get; set; }

    public virtual SysLocweekStartDay? LocuserPrefWeekStartCodeNavigation { get; set; }

    public virtual CmpUser User { get; set; } = null!;
}
